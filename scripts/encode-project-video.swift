// macOS, no extra dependencies. Always encode from the original recording, not a web derivative.
// Usage: swift scripts/encode-project-video.swift INPUT.mov OUTPUT.mp4 POSTER.jpg
// First 19 seconds, centre-cropped to 2:1, 1920×960 at 30 fps; silent H.264 with fast start.
// The JPEG poster can be converted to WebP before publishing to reduce its download size.
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw NSError(domain: "ProjectVideo", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}

try require(CommandLine.arguments.count == 4, "Usage: encode-project-video.swift INPUT.mov OUTPUT.mp4 POSTER.jpg")
let source = URL(fileURLWithPath: CommandLine.arguments[1])
let destination = URL(fileURLWithPath: CommandLine.arguments[2])
let poster = URL(fileURLWithPath: CommandLine.arguments[3])
try require(!FileManager.default.fileExists(atPath: destination.path), "Output already exists: \(destination.path)")
try require(!FileManager.default.fileExists(atPath: poster.path), "Poster already exists: \(poster.path)")

let asset = AVURLAsset(url: source)
let tracks = try await asset.loadTracks(withMediaType: .video)
try require(!tracks.isEmpty, "The recording has no video track")
let track = tracks[0]
let size = try await track.load(.naturalSize)
let orientation = try await track.load(.preferredTransform)
let sourceDuration = try await asset.load(.duration)
try require(CMTimeGetSeconds(sourceDuration) >= 19, "The recording must be at least 19 seconds long")
try require(orientation.isIdentity, "This encoder expects an upright screen recording")
try require(size.width >= 1920 && size.height >= 960, "Use the full-resolution original, not a compressed derivative")

let width = 1920
let height = 960
let duration = CMTime(seconds: 19, preferredTimescale: 600)
let range = CMTimeRange(start: .zero, duration: duration)
let scale = max(CGFloat(width) / size.width, CGFloat(height) / size.height)
let transform = CGAffineTransform(scaleX: scale, y: scale).concatenating(
    CGAffineTransform(translationX: (CGFloat(width) - size.width * scale) / 2,
                      y: (CGFloat(height) - size.height * scale) / 2)
)
let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
layer.setTransform(transform, at: .zero)
let instruction = AVMutableVideoCompositionInstruction()
instruction.timeRange = range
instruction.layerInstructions = [layer]
let composition = AVMutableVideoComposition()
composition.renderSize = CGSize(width: width, height: height)
composition.frameDuration = CMTime(value: 1, timescale: 30)
composition.instructions = [instruction]

let reader = try AVAssetReader(asset: asset)
reader.timeRange = range
let output = AVAssetReaderVideoCompositionOutput(videoTracks: [track], videoSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
])
output.videoComposition = composition
output.alwaysCopiesSampleData = false
try require(reader.canAdd(output), "Cannot configure the video reader")
reader.add(output)

let writer = try AVAssetWriter(outputURL: destination, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 3_500_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoExpectedSourceFrameRateKey: 30,
        AVVideoMaxKeyFrameIntervalKey: 60,
        AVVideoAllowFrameReorderingKey: true,
    ],
])
input.expectsMediaDataInRealTime = false
try require(writer.canAdd(input), "Cannot configure the H.264 encoder")
writer.add(input)
try require(writer.startWriting(), "Cannot start writing: \(String(describing: writer.error))")
writer.startSession(atSourceTime: .zero)
try require(reader.startReading(), "Cannot start reading: \(String(describing: reader.error))")

var frames = 0
while let sample = output.copyNextSampleBuffer() {
    while !input.isReadyForMoreMediaData {
        try require(writer.status == .writing, "Encoding failed: \(String(describing: writer.error))")
        try await Task.sleep(nanoseconds: 1_000_000)
    }
    try require(input.append(sample), "Cannot append a frame: \(String(describing: writer.error))")
    frames += 1
}
try require(reader.status == .completed, "Decoding failed: \(String(describing: reader.error))")
try require(frames == 19 * 30, "Expected 570 frames, received \(frames)")
input.markAsFinished()
writer.endSession(atSourceTime: duration)
await writer.finishWriting()
try require(writer.status == .completed, "Encoding failed: \(String(describing: writer.error))")

let encoded = AVURLAsset(url: destination)
let encodedDuration = try await encoded.load(.duration)
try require(abs(CMTimeGetSeconds(encodedDuration) - 19) < 0.001, "Output duration is not 19 seconds")
let generator = AVAssetImageGenerator(asset: encoded)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let first = try await generator.image(at: .zero)
guard let image = CGImageDestinationCreateWithURL(poster as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
    throw NSError(domain: "ProjectVideo", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot create the poster"])
}
CGImageDestinationAddImage(image, first.image, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
try require(CGImageDestinationFinalize(image), "Cannot write the poster")
let bytes = try destination.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
print("Encoded \(frames) frames: \(width)×\(height), 19 s, \(bytes) bytes; poster: \(poster.path)")
