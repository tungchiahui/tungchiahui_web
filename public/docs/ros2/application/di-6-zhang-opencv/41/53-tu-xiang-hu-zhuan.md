创建包：

```
ros2 pkg create opencv_demo --build-type ament_cmake --dependencies rclcpp sensor_msgs OpenCV cv_bridge image_transport --node-name opencv_base
```

### 1.OpenCV图像读取与显示

OpenCV读取本地图片并显示。

```
#include <cstdio>
#include <opencv2/opencv.hpp>

int main(int argc, char ** argv)
{
  (void) argc;
  (void) argv;
  // 读取图片
  cv::Mat pic = cv::imread("/home/ros2u/map.jpg");  //请自行修改图片路径
  // 显示图片
  cv::imshow("my_pic", pic);
  // 使显示窗口一直处于打开状态
  cv::waitKey(0);               

  return 0;
}
```

Python

```
import cv2

def main(args=None):
    # 读取图片
    pic = cv2.imread("/home/ros2u/map.jpg")  #请自行修改图片路径
    # 显示图片
    cv2.imshow("my_pic", pic)
    # 使显示窗口一直处于打开状态
    cv2.waitKey(0)


if __name__ == '__main__':
    main()
```

### 2.OpenCV转ROS2

```
/*
    需求：读取本地图片，并使用ROS2进行发布。
    流程：
        1.包含头文件；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.读取图片资源；
          3-2.创建图片发布方；
          3-3.创建定时器，在定时器回调函数中实现图片转换以及发布。
        4.调用spin函数，并传入节点对象指针；
        5.资源释放。
*/
// 1.包含头文件；
#include "rclcpp/rclcpp.hpp"
#include "opencv2/opencv.hpp"
#include "sensor_msgs/msg/image.hpp"
#include "cv_bridge/cv_bridge.h"

using namespace std::chrono_literals;

// 3.自定义节点类；
class OpencvRos2: public rclcpp::Node{
public:
    OpencvRos2():Node("opencv_ros2_node_cpp"){
      // 读取图片
      pic = cv::imread("/home/ros2u/map.jpg");  //请自行修改图片路径
      // 图片发布方
      img_pub = this->create_publisher<sensor_msgs::msg::Image>("image_raw",10);
      // 定时器
      timer = this->create_wall_timer(0.1s,std::bind(&OpencvRos2::cb,this));
    }
private:
    rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr img_pub;
    rclcpp::TimerBase::SharedPtr timer;
    cv::Mat pic;
    void cb(){
      // 转换成ROS2的图片消息
      auto ros_image = cv_bridge::CvImage(std_msgs::msg::Header(), "bgr8", pic).toImageMsg();
      ros_image->header.frame_id="camera";
      ros_image->header.stamp = this->now();
      // 发布图片
      img_pub->publish(*ros_image);

    }
};

int main(int argc, char const *argv[])
{
    // 2.初始化ROS2客户端；
    rclcpp::init(argc,argv);
    // 4.调用spain函数，并传入节点对象指针；
    rclcpp::spin(std::make_shared<OpencvRos2>());
    // 5.资源释放。
    rclcpp::shutdown();
    return 0;
}
```

python

```
import cv2
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from cv_bridge import CvBridge
from std_msgs.msg import Header
import pathlib
import os

class OpencvRos2(Node):

    def __init__(self):
        super().__init__('opencv_ros2_node_py')


        # 读取图片
        home_path = str(pathlib.Path.home())
        pic_path = os.path.join(home_path, "map.jpg") # 请自行修改图片路径
        self.pic = cv2.imread(pic_path)

        # 图片发布方
        self.img_pub = self.create_publisher(Image, 'image_raw', 10)

        # 定时器
        timer_period = 0.1  # seconds
        self.timer = self.create_timer(timer_period, self.cb)

        # 创建CvBridge对象
        self.bridge = CvBridge()

    def cb(self):
        # 转换成ROS2的图片消息
        ros_image = self.bridge.cv2_to_imgmsg(self.pic, encoding='bgr8')
        ros_image.header.frame_id = 'camera'
        ros_image.header.stamp = self.get_clock().now().to_msg()

        # 发布图片
        self.img_pub.publish(ros_image)


def main(args=None):
    # 初始化ROS2客户端
    rclpy.init(args=args)
    # 创建节点对象
    opencv_ros2_node = OpencvRos2()
    # 调用spin函数
    rclpy.spin(opencv_ros2_node)
    # 节点销毁与资源释放
    opencv_ros2_node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
```

### 3.ROS2转OpenCV

```
/*
    需求：
    流程：
        1.包含头文件；
        2.初始化ROS2客户端；
        3.自定义节点类；

        4.调用spin函数，并传入节点对象指针；
        5.资源释放。
*/
// 1.包含头文件；
#include "rclcpp/rclcpp.hpp"
#include "opencv2/opencv.hpp"
#include "cv_bridge/cv_bridge.h"
#include "sensor_msgs/msg/image.hpp"


using namespace std::placeholders;
// 3.自定义节点类；
class Ros2Opencv: public rclcpp::Node{
public:
    Ros2Opencv():Node("ros2_opencv_node_cpp"){

        image_sub = this->create_subscription<sensor_msgs::msg::Image>("/image",10,std::bind(&Ros2Opencv::cb,this,_1));

    }

private:
    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr image_sub;
    void cb(const sensor_msgs::msg::Image & image){
      try
      {
        // RCLCPP_INFO(this->get_logger(),"-----");
        auto cv_img_ptr = cv_bridge::toCvCopy(image,sensor_msgs::image_encodings::BGR8);
        cv::Mat mat = cv_img_ptr->image;
        // 在 OpenCV 窗口中显示图像
        cv::imshow("ROS2 image", mat);
        cv::waitKey(1);
      }
      catch(cv_bridge::Exception& e)
      {
        RCLCPP_INFO(this->get_logger(),"error:%s",e.what());
      }



    }
};

int main(int argc, char const *argv[])
{
    // 2.初始化ROS2客户端；
    rclcpp::init(argc,argv);
    // 4.调用spain函数，并传入节点对象指针；
    rclcpp::spin(std::make_shared<Ros2Opencv>());
    // 5.资源释放。
    rclcpp::shutdown();
    return 0;
}
```

Python

```
# 1. 导入模块；
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from cv_bridge import CvBridge
import cv2


# 3. 自定义节点类；
class Ros2Opencv(Node):
    def __init__(self):
        super().__init__('ros2_opencv_node_py')
        self.image_sub = self.create_subscription(
            Image,
            '/image',
            self.cb,
            10)
        self.cv_bridge = CvBridge()


    def cb(self, image_msg):
        try:
            # 将 ROS 图像消息转换为 OpenCV 图像格式
            cv_img = self.cv_bridge.imgmsg_to_cv2(image_msg, 'bgr8')
            # 在 OpenCV 窗口中显示图像
            cv2.imshow('ROS2 image', cv_img)
            cv2.waitKey(1)

        except Exception as e:
            self.get_logger().info('Error: %s' % str(e))


def main(args=None):
    # 2. 初始化 ROS2 客户端；
    rclpy.init(args=args)

    # 创建节点对象；
    ros2_opencv = Ros2Opencv()

    # 4. 调用 spin 函数，并传入节点对象；
    rclpy.spin(ros2_opencv)

    # 5. 资源释放。
    ros2_opencv.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
```



